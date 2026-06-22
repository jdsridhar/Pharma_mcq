import { listAuditLogsQuerySchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class ListAuditLogsQueryDto extends createZodDto(listAuditLogsQuerySchema) {}
