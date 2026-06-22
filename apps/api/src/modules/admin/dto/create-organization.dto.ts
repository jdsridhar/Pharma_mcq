import { createOrganizationSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class CreateOrganizationDto extends createZodDto(createOrganizationSchema) {}
