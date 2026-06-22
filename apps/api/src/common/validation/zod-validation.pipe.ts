import {
  type ArgumentMetadata,
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';
import { ZodError, type ZodSchema } from 'zod';

/**
 * Global validation pipe. When the route's parameter type is a Zod DTO (created via
 * `createZodDto`), its schema is parsed/coerced; otherwise the value passes through
 * untouched. Zod errors become a 400 with flattened field issues (surfaced by
 * AllExceptionsFilter as `details`).
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    const metatype = metadata.metatype as { schema?: ZodSchema } | undefined;
    const schema = metatype?.schema;
    if (!schema) {
      return value;
    }

    try {
      return schema.parse(value);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new BadRequestException({
          message: 'Validation failed',
          errors: error.flatten(),
        });
      }
      throw error;
    }
  }
}
