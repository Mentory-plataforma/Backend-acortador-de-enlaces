import { IsUrl, IsOptional, IsString, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateLinkDto {
  @ApiProperty({ example: 'https://google.com', description: 'URL de destino' })
  @IsUrl()
  url?: string;

  @ApiPropertyOptional({ example: 'promo24', description: 'Alias personalizado' })
  @IsOptional()
  @IsString()
  alias?: string;
}

export class UpdateLinkDto {
  @ApiPropertyOptional({ example: 'https://google.com', description: 'Nueva URL de destino' })
  @IsOptional()
  @IsUrl()
  url?: string;

  @ApiPropertyOptional({ example: 'Ruta', description: 'Nuevo alias personalizado' })
  @IsOptional()
  @IsString()
  alias?: string;

  @ApiPropertyOptional({ example: false, description: 'Estado del enlace' })
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
