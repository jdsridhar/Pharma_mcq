import { listNotificationsQuerySchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class ListNotificationsQueryDto extends createZodDto(listNotificationsQuerySchema) {}
