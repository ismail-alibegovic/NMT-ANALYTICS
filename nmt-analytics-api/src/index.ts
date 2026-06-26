import 'dotenv/config';
import app from './app';

const PORT = process.env.PORT || 3001;

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`API running on http://localhost:${PORT}`);
  console.log('Supabase admin client initialized: ok');
});
