import { Router } from 'express';
import { ChatbotController } from './chatbot.controller';
import { authenticate, authorize } from '../../middleware/auth';
import { UserRole } from '../../types';

const router = Router();
const controller = new ChatbotController();

router.use(authenticate);

router.get('/', controller.list);
router.get('/:id', controller.getById);
router.post('/', authorize(UserRole.ADMIN, UserRole.MANAGER), controller.create);
router.put('/:id', authorize(UserRole.ADMIN, UserRole.MANAGER), controller.update);
router.delete('/:id', authorize(UserRole.ADMIN), controller.delete);
router.post('/:id/documents', authorize(UserRole.ADMIN, UserRole.MANAGER), controller.addDocument);
router.get('/:id/documents', controller.getDocuments);
router.delete('/:id/documents/:docId', authorize(UserRole.ADMIN, UserRole.MANAGER), controller.removeDocument);
router.post('/:id/test', controller.testChatbot);

export { router as chatbotRoutes };
