import { createRecommendationRuleSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class CreateRecommendationRuleDto extends createZodDto(createRecommendationRuleSchema) {}
