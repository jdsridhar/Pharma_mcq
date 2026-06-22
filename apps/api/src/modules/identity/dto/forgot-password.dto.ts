import { forgotPasswordSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class ForgotPasswordDto extends createZodDto(forgotPasswordSchema) {}
