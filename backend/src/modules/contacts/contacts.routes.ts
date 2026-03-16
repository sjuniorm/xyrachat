import { Router } from 'express';
import { ContactsController } from './contacts.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();
const controller = new ContactsController();

router.use(authenticate);

router.get('/', controller.list);
router.get('/:id', controller.getById);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.delete('/:id', controller.delete);
router.get('/:id/conversations', controller.getConversations);
router.post('/:id/tags', controller.addTag);
router.delete('/:id/tags/:tagId', controller.removeTag);

export { router as contactRoutes };
