import {
  IsString,
  IsArray,
  IsIn,
  IsNotEmpty,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * ChatMessageDto — validates a single message in a ChatRequest.
 *
 * Enforces:
 *  - role: must be 'user' or 'assistant' (T-05-05 / ENG-03)
 *  - content: must be a non-empty string
 */
export class ChatMessageDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  @IsNotEmpty()
  content!: string;
}

/**
 * ChatRequestDto — validates the POST /agent/chat request body.
 *
 * Enforces:
 *  - messages: must be a non-empty array of ChatMessageDto objects
 *
 * IMPORTANT: @Type(() => ChatMessageDto) is mandatory — without it,
 * nested @IsIn on ChatMessageDto silently passes (RESEARCH Pitfall 1).
 * class-transformer must transform the plain object to a class instance
 * before class-validator can run nested decorators.
 */
export class ChatRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages!: ChatMessageDto[];
}
