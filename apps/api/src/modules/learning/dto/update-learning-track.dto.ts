import { updateLearningTrackSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class UpdateLearningTrackDto extends createZodDto(updateLearningTrackSchema) {}
