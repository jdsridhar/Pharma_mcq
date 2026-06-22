import { startAdHocTestSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class StartAdHocTestDto extends createZodDto(startAdHocTestSchema) {}
