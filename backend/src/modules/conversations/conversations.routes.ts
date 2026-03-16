import { Router } from 'express';
import { ConversationsController } from './conversations.controller';
import { authenticate, authorize } from '../../middleware/auth';
import { UserRole } from '../../types';

const router = Router();
const controller = new ConversationsController();

router.use(authenticate);

router.get('/', controller.list);
router.get('/:id', controller.getById);
router.post('/', controller.create);
router.patch('/:id/status', controller.updateStatus);
router.patch('/:id/assign', controller.assign);
router.post('/:id/messages', controller.sendMessage);
router.get('/:id/messages', controller.getMessages);
router.post('/:id/notes', controller.addNote);
router.get('/:id/notes', controller.getNotes);
router.post('/:id/tags', controller.addTag);
router.delete('/:id/tags/:tagId', controller.removeTag);

export { router as conversationRoutes };
