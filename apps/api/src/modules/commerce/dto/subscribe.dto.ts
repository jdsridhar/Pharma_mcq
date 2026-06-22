import { subscribeSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class SubscribeDto extends createZodDto(subscribeSchema) {}
