export class ContentStoreError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ContentStoreError';
    this.status = status;
  }
}
