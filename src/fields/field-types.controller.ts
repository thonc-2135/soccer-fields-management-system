import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FieldsService } from './fields.service.js';

@ApiTags('fields')
@Controller('field-types')
export class FieldTypesController {
  constructor(private readonly fieldsService: FieldsService) {}

  @Get()
  @ApiOperation({ summary: 'Field types (for the filter dropdown)' })
  findAll() {
    return this.fieldsService.findTypes();
  }
}
