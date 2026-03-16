import { pool } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';
import { logger } from '../../utils/logger';
import { AutomationTriggerType, AutomationActionType } from '../../types';

export class AutomationService {
  async list(tenantId: string) {
    const result = await pool.query(
      `SELECT w.*, 
        (SELECT json_agg(s ORDER BY s.step_order) FROM automation_steps s WHERE s.workflow_id = w.id) as steps
       FROM automation_workflows w WHERE w.tenant_id = $1 ORDER BY w.created_at DESC`,
      [tenantId]
    );
    return result.rows;
  }

  async getById(tenantId: string, id: string) {
    const result = await pool.query(
      `SELECT w.*, 
        (SELECT json_agg(s ORDER BY s.step_order) FROM automation_steps s WHERE s.workflow_id = w.id) as steps
       FROM automation_workflows w WHERE w.id = $1 AND w.tenant_id = $2`,
      [id, tenantId]
    );
    if (result.rows.length === 0) throw new AppError('Workflow not found', 404);
    return result.rows[0];
  }

  async create(tenantId: string, data: any) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const wfResult = await client.query(
        `INSERT INTO automation_workflows (tenant_id, name, description, trigger_type, trigger_config)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [tenantId, data.name, data.description, data.triggerType, JSON.stringify(data.triggerConfig || {})]
      );
      const workflow = wfResult.rows[0];

      if (data.steps?.length) {
        for (let i = 0; i < data.steps.length; i++) {
          const step = data.steps[i];
          await client.query(
            `INSERT INTO automation_steps (workflow_id, step_order, action_type, action_config, condition_config)
             VALUES ($1, $2, $3, $4, $5)`,
            [workflow.id, i + 1, step.actionType, JSON.stringify(step.actionConfig || {}), step.conditionConfig ? JSON.stringify(step.conditionConfig) : null]
          );
        }
      }

      await client.query('COMMIT');
      return this.getById(tenantId, workflow.id);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async update(tenantId: string, id: string, data: any) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const fields: string[] = [];
      const params: any[] = [];
      let idx = 1;

      if (data.name) { fields.push(`name = $${idx++}`); params.push(data.name); }
      if (data.description !== undefined) { fields.push(`description = $${idx++}`); params.push(data.description); }
      if (data.triggerType) { fields.push(`trigger_type = $${idx++}`); params.push(data.triggerType); }
      if (data.triggerConfig) { fields.push(`trigger_config = $${idx++}`); params.push(JSON.stringify(data.triggerConfig)); }
      if (data.isActive !== undefined) { fields.push(`is_active = $${idx++}`); params.push(data.isActive); }

      if (fields.length > 0) {
        params.push(id, tenantId);
        const result = await client.query(
          `UPDATE automation_workflows SET ${fields.join(', ')} WHERE id = $${idx++} AND tenant_id = $${idx} RETURNING *`,
          params
        );
        if (result.rows.length === 0) throw new AppError('Workflow not found', 404);
      }

      if (data.steps) {
        await client.query('DELETE FROM automation_steps WHERE workflow_id = $1', [id]);
        for (let i = 0; i < data.steps.length; i++) {
          const step = data.steps[i];
          await client.query(
            `INSERT INTO automation_steps (workflow_id, step_order, action_type, action_config, condition_config)
             VALUES ($1, $2, $3, $4, $5)`,
            [id, i + 1, step.actionType, JSON.stringify(step.actionConfig || {}), step.conditionConfig ? JSON.stringify(step.conditionConfig) : null]
          );
        }
      }

      await client.query('COMMIT');
      return this.getById(tenantId, id);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async delete(tenantId: string, id: string) {
    const result = await pool.query(
      'DELETE FROM automation_workflows WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [id, tenantId]
    );
    if (result.rows.length === 0) throw new AppError('Workflow not found', 404);
  }

  async getLogs(tenantId: string, workflowId: string) {
    const result = await pool.query(
      `SELECT * FROM automation_logs WHERE workflow_id = $1 AND tenant_id = $2 ORDER BY started_at DESC LIMIT 100`,
      [workflowId, tenantId]
    );
    return result.rows;
  }

  async executeWorkflows(tenantId: string, triggerType: AutomationTriggerType, context: any) {
    const workflows = await pool.query(
      `SELECT w.*, 
        (SELECT json_agg(s ORDER BY s.step_order) FROM automation_steps s WHERE s.workflow_id = w.id) as steps
       FROM automation_workflows w
       WHERE w.tenant_id = $1 AND w.trigger_type = $2 AND w.is_active = true`,
      [tenantId, triggerType]
    );

    for (const workflow of workflows.rows) {
      try {
        await this.executeWorkflow(tenantId, workflow, context);
      } catch (error) {
        logger.error(`Automation workflow ${workflow.id} failed`, error);
      }
    }
  }

  private async executeWorkflow(tenantId: string, workflow: any, context: any) {
    const logResult = await pool.query(
      `INSERT INTO automation_logs (tenant_id, workflow_id, conversation_id, status) VALUES ($1, $2, $3, 'running') RETURNING id`,
      [tenantId, workflow.id, context.conversationId]
    );
    const logId = logResult.rows[0].id;
    const executedSteps: any[] = [];

    try {
      const steps = workflow.steps || [];
      for (const step of steps) {
        if (step.condition_config) {
          const conditionMet = this.evaluateCondition(step.condition_config, context);
          if (!conditionMet) {
            executedSteps.push({ stepOrder: step.step_order, skipped: true, reason: 'Condition not met' });
            continue;
          }
        }

        await this.executeAction(tenantId, step, context);
        executedSteps.push({ stepOrder: step.step_order, completed: true });
      }

      await pool.query(
        `UPDATE automation_logs SET status = 'completed', executed_steps = $1, completed_at = NOW() WHERE id = $2`,
        [JSON.stringify(executedSteps), logId]
      );
      await pool.query(
        `UPDATE automation_workflows SET execution_count = execution_count + 1 WHERE id = $1`,
        [workflow.id]
      );
    } catch (error: any) {
      await pool.query(
        `UPDATE automation_logs SET status = 'failed', executed_steps = $1, error = $2, completed_at = NOW() WHERE id = $3`,
        [JSON.stringify(executedSteps), error.message, logId]
      );
    }
  }

  private evaluateCondition(config: any, context: any): boolean {
    if (!config) return true;

    switch (config.type) {
      case 'keyword_match':
        return context.messageContent?.toLowerCase().includes(config.keyword?.toLowerCase());
      case 'channel_type':
        return context.channelType === config.channelType;
      case 'lead_status':
        return context.leadStatus === config.leadStatus;
      default:
        return true;
    }
  }

  private async executeAction(tenantId: string, step: any, context: any) {
    const config = step.action_config || {};

    switch (step.action_type) {
      case AutomationActionType.SEND_MESSAGE:
        await pool.query(
          `INSERT INTO messages (tenant_id, conversation_id, direction, message_type, content, is_from_bot)
           VALUES ($1, $2, 'outbound', 'text', $3, true)`,
          [tenantId, context.conversationId, config.message]
        );
        await pool.query(
          `UPDATE conversations SET last_message_at = NOW(), last_message_preview = $1 WHERE id = $2`,
          [config.message?.substring(0, 100), context.conversationId]
        );
        break;

      case AutomationActionType.ASSIGN_AGENT:
        await pool.query(
          'UPDATE conversations SET assigned_user_id = $1 WHERE id = $2',
          [config.userId, context.conversationId]
        );
        break;

      case AutomationActionType.ADD_TAG:
        await pool.query(
          'INSERT INTO conversation_tags (conversation_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [context.conversationId, config.tagId]
        );
        break;

      case AutomationActionType.CLOSE_CONVERSATION:
        await pool.query(
          "UPDATE conversations SET status = 'closed', closed_at = NOW() WHERE id = $1",
          [context.conversationId]
        );
        break;

      case AutomationActionType.START_CHATBOT:
        await pool.query(
          'UPDATE conversations SET is_bot_active = true WHERE id = $1',
          [context.conversationId]
        );
        break;

      default:
        logger.warn(`Unknown automation action type: ${step.action_type}`);
    }
  }
}
