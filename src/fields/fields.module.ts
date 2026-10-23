import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettingsModule } from '../settings/settings.module.js';
import { FieldTypesController } from './field-types.controller.js';
import { FieldImage } from './entities/field-image.entity.js';
import { FieldPrice } from './entities/field-price.entity.js';
import { FieldType } from './entities/field-type.entity.js';
import { Field } from './entities/field.entity.js';
import { FieldsController } from './fields.controller.js';
import { FieldsService } from './fields.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Field, FieldType, FieldImage, FieldPrice]),
    SettingsModule,
  ],
  controllers: [FieldsController, FieldTypesController],
  providers: [FieldsService],
  exports: [TypeOrmModule, FieldsService],
})
export class FieldsModule {}
