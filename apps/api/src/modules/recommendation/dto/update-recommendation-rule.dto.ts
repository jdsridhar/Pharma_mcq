import { updateRecommendationRuleSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class UpdateRecommendationRuleDto extends createZodDto(updateRecommendationRuleSchema) {}
