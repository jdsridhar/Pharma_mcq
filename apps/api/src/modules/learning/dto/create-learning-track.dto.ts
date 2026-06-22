import { createLearningTrackSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class CreateLearningTrackDto extends createZodDto(createLearningTrackSchema) {}
