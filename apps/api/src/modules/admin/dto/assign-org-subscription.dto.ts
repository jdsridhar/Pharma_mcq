import { assignOrgSubscriptionSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class AssignOrgSubscriptionDto extends createZodDto(assignOrgSubscriptionSchema) {}
