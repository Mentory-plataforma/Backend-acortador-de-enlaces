import { IsUrl, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateLinkDto {
  @ApiProperty({ example: 'https://google.com', description: 'URL de destino' })
  @IsUrl()
  url: string;

  @ApiPropertyOptional({ example: 'promo24', description: 'Alias personalizado' })
  @IsOptional()
  @IsString()
  alias?: string;
}

export class UpdateLinkDto {
  @ApiProperty({ example: 'https://google.com', description: 'Nueva URL de destino' })
  @IsUrl()
  url: string;
}
