import { loginSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class LoginDto extends createZodDto(loginSchema) {}
