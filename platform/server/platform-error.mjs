export class PlatformError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
