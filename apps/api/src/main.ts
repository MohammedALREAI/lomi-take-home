import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { setupSwagger } from "./swagger.js";

const app = await NestFactory.create(AppModule);
app.enableCors();
app.enableShutdownHooks();
setupSwagger(app);
await app.listen(Number(process.env.PORT ?? 3001), "0.0.0.0");
