import { registerSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class RegisterDto extends createZodDto(registerSchema) {}
