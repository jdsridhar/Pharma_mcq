import type { z, ZodSchema } from 'zod';

/**
 * Minimal, dependency-free equivalent of nestjs-zod's `createZodDto`: produces a class
 * that carries its Zod schema as a static. `ZodValidationPipe` reads that static to
 * validate incoming payloads, giving us Zod DTOs without a fragile third-party bridge.
 *
 * Usage:
 *   const CreateThingSchema = z.object({ name: z.string() });
 *   export class CreateThingDto extends createZodDto(CreateThingSchema) {}
 */
export interface ZodDtoStatic<TSchema extends ZodSchema = ZodSchema> {
  new (): z.infer<TSchema>;
  schema: TSchema;
  create(input: unknown): z.infer<TSchema>;
}

export function createZodDto<TSchema extends ZodSchema>(schema: TSchema): ZodDtoStatic<TSchema> {
  class AugmentedZodDto {
    static schema = schema;
    static create(input: unknown): z.infer<TSchema> {
      return schema.parse(input);
    }
  }
  return AugmentedZodDto as unknown as ZodDtoStatic<TSchema>;
}
