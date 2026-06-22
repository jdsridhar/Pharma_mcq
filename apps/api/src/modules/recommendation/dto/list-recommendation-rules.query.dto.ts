import { listRecommendationRulesQuerySchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class ListRecommendationRulesQueryDto extends createZodDto(listRecommendationRulesQuerySchema) {}
