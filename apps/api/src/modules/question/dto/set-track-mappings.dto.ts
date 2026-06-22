import { setTrackMappingsSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class SetTrackMappingsDto extends createZodDto(setTrackMappingsSchema) {}
