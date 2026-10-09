import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { DatabaseService } from '../database/database.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const { email, password, secretCode } = dto;

    if (secretCode !== process.env.REGISTER_SECRET) {
      throw new UnauthorizedException('Código de invitación inválido');
    }

    const existingUser = await this.db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.length > 0) {
      throw new ConflictException('El correo electrónico ya está registrado');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await this.db.query(
      'INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id, email',
      [email, hashedPassword],
    );

    return {
      ...result[0],
      message: 'Usuario registrado exitosamente',
    };
  }

  async login(dto: LoginDto) {
    const { email, password } = dto;
    const users = await this.db.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = users[0];

    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const payload = { sub: user.id, email: user.email };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
      },
    };
  }
}
