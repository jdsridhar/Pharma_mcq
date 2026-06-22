import { sendNotificationSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class SendNotificationDto extends createZodDto(sendNotificationSchema) {}
