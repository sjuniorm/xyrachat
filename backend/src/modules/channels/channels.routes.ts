import { Router } from 'express';
import { ChannelsController } from './channels.controller';
import { authenticate, authorize } from '../../middleware/auth';
import { UserRole } from '../../types';

const router = Router();
const controller = new ChannelsController();

router.use(authenticate);

router.get('/', controller.list);
router.get('/:id', controller.getById);
router.post('/', authorize(UserRole.ADMIN, UserRole.MANAGER), controller.create);
router.put('/:id', authorize(UserRole.ADMIN, UserRole.MANAGER), controller.update);
router.delete('/:id', authorize(UserRole.ADMIN), controller.delete);

export { router as channelRoutes };
