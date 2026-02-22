/**
 * Structured Logging Utility
 * 
 * Provides consistent logging format for observability
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  userId?: string;
  role?: string;
  requestId?: string;
  path?: string;
  method?: string;
  [key: string]: any;
}

class Logger {
  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      ...context,
    };
    
    return JSON.stringify(logEntry);
  }

  debug(message: string, context?: LogContext): void {
    if (process.env.NODE_ENV === "development") {
      console.debug(this.formatMessage("debug", message, context));
    }
  }

  info(message: string, context?: LogContext): void {
    console.log(this.formatMessage("info", message, context));
  }

  warn(message: string, context?: LogContext): void {
    console.warn(this.formatMessage("warn", message, context));
  }

  error(message: string, error?: Error | unknown, context?: LogContext): void {
    const errorContext = {
      ...context,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : String(error),
    };
    
    console.error(this.formatMessage("error", message, errorContext));
  }

  /**
   * Log API request
   */
  logRequest(method: string, path: string, userId?: string, role?: string): void {
    this.info(`${method} ${path}`, {
      method,
      path,
      userId,
      role,
      type: "api_request",
    });
  }

  /**
   * Log API response
   */
  logResponse(method: string, path: string, statusCode: number, duration?: number): void {
    this.info(`${method} ${path} - ${statusCode}`, {
      method,
      path,
      statusCode,
      duration,
      type: "api_response",
    });
  }

  /**
   * Log database operation
   */
  logDatabase(operation: string, table: string, context?: LogContext): void {
    this.debug(`DB ${operation} on ${table}`, {
      ...context,
      operation,
      table,
      type: "database",
    });
  }

  /**
   * Log payment transaction
   */
  logPayment(transactionId: string, status: string, amount?: number, context?: LogContext): void {
    this.info(`Payment ${status}`, {
      ...context,
      transactionId,
      status,
      amount,
      type: "payment",
    });
  }

  /**
   * Log notification
   */
  logNotification(eventType: string, recipients: string, status: string, context?: LogContext): void {
    this.info(`Notification ${status}`, {
      ...context,
      eventType,
      recipients,
      status,
      type: "notification",
    });
  }

  /**
   * Log admin action
   */
  logAdminAction(action: string, resource: string, resourceId: string, userId: string, context?: LogContext): void {
    this.info(`Admin ${action}`, {
      ...context,
      action,
      resource,
      resourceId,
      userId,
      type: "admin_action",
    });
  }
}

export const logger = new Logger();
