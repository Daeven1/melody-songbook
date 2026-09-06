export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // one column per bar of the thirteen-bar bench
      gridTemplateColumns: { 13: 'repeat(13, minmax(0, 1fr))' },
    },
  },
  plugins: [],
}
