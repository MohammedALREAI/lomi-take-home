import { Body, Controller, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import { reviewRequestSchema } from "@app/core";
import { reviewValue } from "@app/db";
import { requireBody } from "./http.js";
import { PrismaService } from "./prisma.service.js";
import { reviewBodySchema } from "./swagger.js";

@ApiTags("values")
@Controller("values")
export class ValuesController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Approves a value or records a correction. A correction is stored beside
   * the model's value, never over it. Returns 409 if the value belongs to a
   * version that is no longer the current one.
   */
  @Post(":id/review")
  @HttpCode(201)
  @ApiParam({ name: "id", description: "Value id from GET /documents/{id}" })
  @ApiOperation({
    summary: "Approve a value, or correct it with an optional note",
    description: "A correction is stored beside the model's value; the latest review decides the value's state.",
  })
  @ApiBody({ schema: reviewBodySchema })
  @ApiResponse({ status: 201, description: "Review recorded." })
  @ApiResponse({ status: 400, description: "Invalid body, or a corrected value that is not valid for the field's type." })
  @ApiResponse({ status: 404, description: "No such value." })
  @ApiResponse({ status: 409, description: "The value belongs to a version that is no longer current." })
  review(@Param("id") id: string, @Body() body: unknown) {
    return reviewValue(this.prisma.db, id, requireBody(reviewRequestSchema, body));
  }
}
