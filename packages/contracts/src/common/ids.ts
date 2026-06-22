import { z } from 'zod';

/** All public identifiers are UUID v7 (time-ordered). Validated as UUID at the boundary. */
export const uuidSchema = z.string().uuid();
export type Uuid = string;

/** ISO-8601 timestamp string, as serialized over the wire. */
export const isoDateTimeSchema = z.string().datetime({ offset: true });
export type IsoDateTime = string;
