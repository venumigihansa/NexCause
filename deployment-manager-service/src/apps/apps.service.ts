import { Injectable, NotFoundException } from '@nestjs/common';
import { AppSourceType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CreateAppDto } from './dto/create-app.dto';

@Injectable()
export class AppsService {
  constructor(private readonly prisma: PrismaService) {}

  create(createAppDto: CreateAppDto) {
    return this.prisma.app.create({
      data: {
        ...createAppDto,
        sourceType: createAppDto.sourceType ?? AppSourceType.image,
      },
    });
  }

  findAll() {
    return this.prisma.app.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneOrThrow(id: string) {
    const app = await this.prisma.app.findUnique({
      where: { id },
    });

    if (!app) {
      throw new NotFoundException(`App ${id} was not found`);
    }

    return app;
  }
}
