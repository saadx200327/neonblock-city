export default function handler(req,res){
  res.setHeader('Cache-Control','public, max-age=31536000, immutable');
  res.statusCode=307;
  res.setHeader('Location','/cardfolio-brand.png?v=20260909-brand-static-1');
  res.end();
}
