import { setTrackProgressSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class SetTrackProgressDto extends createZodDto(setTrackProgressSchema) {}
