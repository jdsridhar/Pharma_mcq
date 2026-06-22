import { assignRoleSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class AssignRoleDto extends createZodDto(assignRoleSchema) {}
