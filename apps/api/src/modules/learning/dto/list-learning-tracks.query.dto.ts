import { listLearningTracksQuerySchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class ListLearningTracksQueryDto extends createZodDto(listLearningTracksQuerySchema) {}
