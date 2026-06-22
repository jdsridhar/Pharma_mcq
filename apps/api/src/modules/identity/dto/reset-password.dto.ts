import { resetPasswordSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class ResetPasswordDto extends createZodDto(resetPasswordSchema) {}
