export const mediaService = {
  /**
   * Reads a local File object and converts it to a base64 Data URL.
   * Storing as base64 inside SQLite is ideal for a 100% offline app.
   */
  async uploadAvatar(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error("Failed to convert file to base64"));
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  },

  async uploadTeamLogo(file: File): Promise<string> {
    return this.uploadAvatar(file);
  }
};
