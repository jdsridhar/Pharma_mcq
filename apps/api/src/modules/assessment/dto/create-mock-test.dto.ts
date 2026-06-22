import { createMockTestSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class CreateMockTestDto extends createZodDto(createMockTestSchema) {}
