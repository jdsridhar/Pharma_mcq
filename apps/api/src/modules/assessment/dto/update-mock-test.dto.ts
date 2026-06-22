import { updateMockTestSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class UpdateMockTestDto extends createZodDto(updateMockTestSchema) {}
