import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { User } from '../users/entities/user.entity.js';
import { ValidateVoucherDto } from './dto/validate-voucher.dto.js';
import { VouchersService } from './vouchers.service.js';

@ApiTags('vouchers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('vouchers')
export class VouchersController {
  constructor(private readonly service: VouchersService) {}

  @Post('validate')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Check a voucher against an order amount and get the discount',
  })
  async validate(@Body() dto: ValidateVoucherDto, @CurrentUser() user: User) {
    const { voucher, discount } = await this.service.evaluate(
      dto.code,
      dto.amount,
      user.id,
    );
    return {
      valid: true,
      code: voucher.code,
      type: voucher.type,
      value: voucher.value,
      discount,
      total: dto.amount - discount,
    };
  }
}
