import axios, { AxiosInstance, AxiosError, AxiosResponse } from 'axios';

interface ApiClientConfig {
  baseUrl: string;
  getToken: () => string | null;
  onAuthError: () => void;
}

class ApiClient {
  private client: AxiosInstance;
  private onAuthError: () => void;

  constructor(config: ApiClientConfig) {
    this.onAuthError = config.onAuthError;
    this.client = axios.create({
      baseURL: config.baseUrl,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.client.interceptors.request.use((req) => {
      const token = config.getToken();
      if (token) {
        req.headers.Authorization = `Bearer ${token}`;
      }
      return req;
    });

    this.client.interceptors.response.use(
      (res) => {
        // Log x-request-id in development
        if (process.env.NODE_ENV === 'development') {
          const requestId = res.headers['x-request-id'];
          if (requestId) {
            console.log(`[API Client] Request ID: ${requestId}`);
          }
        }
        return res;
      },
      async (error: AxiosError) => {
        if (error.response) {
          const { status } = error.response;
          if (status === 401 || status === 403) {
            console.log('Authentication error detected, triggering auth error handler');
            this.onAuthError();
          }
        }
        return Promise.reject(error);
      }
    );
  }

  public async get<T>(path: string, params?: object, config?: any): Promise<T> {
    const response = await this.client.get<T>(path, { params, ...config });
    return response.data;
  }

  public async post<T>(path: string, data: object, config?: any): Promise<T> {
    const response = await this.client.post<T>(path, data, config);
    return response.data;
  }

  public async put<T>(path: string, data: object, config?: any): Promise<T> {
    const response = await this.client.put<T>(path, data, config);
    return response.data;
  }

  public async patch<T>(path: string, data: object, config?: any): Promise<T> {
    const response = await this.client.patch<T>(path, data, config);
    return response.data;
  }

  public async delete<T>(path: string, params?: object, config?: any): Promise<T> {
    const response = await this.client.delete<T>(path, { params, ...config });
    return response.data;
  }
}

export default ApiClient;
