import { setUserStatusSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class SetUserStatusDto extends createZodDto(setUserStatusSchema) {}
