import { graphTraversalQuerySchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class GraphTraversalQueryDto extends createZodDto(graphTraversalQuerySchema) {}
