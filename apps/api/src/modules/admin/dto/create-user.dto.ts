import { createUserSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class CreateUserDto extends createZodDto(createUserSchema) {}
