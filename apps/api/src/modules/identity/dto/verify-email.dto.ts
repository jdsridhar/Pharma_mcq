import { verifyEmailSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class VerifyEmailDto extends createZodDto(verifyEmailSchema) {}
