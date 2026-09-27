import dns from 'dns';
try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch (_) {}
import { checkUrl } from './image-curator.js';

// Let's test a collection of distinct Unsplash image IDs for the screenshot products and categories
const testUrls = {
  // 1. Screenshot products:
  biolite_campstove: 'https://images.unsplash.com/photo-1510312305653-8ed496efae75?w=800&auto=format&fit=crop&q=80', // camping stove
  stanley_tumbler: 'https://images.unsplash.com/photo-1577937927133-66ef06acdf18?w=800&auto=format&fit=crop&q=80', // tumbler / insulated travel cup
  yeti_cooler: 'https://images.unsplash.com/photo-1563245372-f21724e3856d?w=800&auto=format&fit=crop&q=80', // camping cooler ice box
  dyson_hairdryer: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800&auto=format&fit=crop&q=80', // hair dryer
  omron_bp_monitor: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=800&auto=format&fit=crop&q=80', // medical digital device
  peak_design_backpack: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&auto=format&fit=crop&q=80', // dark backpack
  osprey_backpack: 'https://images.unsplash.com/photo-1546938576-6e6a64f317cc?w=800&auto=format&fit=crop&q=80', // travel backpack
  matador_mountain_backpack: 'https://images.unsplash.com/photo-1622560480605-d83c853bc5c3?w=800&auto=format&fit=crop&q=80', // technical mountain backpack
  nitecore_powerbank: 'https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=800&auto=format&fit=crop&q=80', // sleek black power bank
  monos_suitcase: 'https://images.unsplash.com/photo-1565026057447-bc90a3dceb87?w=800&auto=format&fit=crop&q=80', // hard shell suitcase

  // 2. Cosmetics & Nahane/Sabun:
  soap_bar_lavender: 'https://images.unsplash.com/photo-1607006314644-88cb206fb7a7?w=800&auto=format&fit=crop&q=80', // handmade soap bar
  soap_bar_oatmeal: 'https://images.unsplash.com/photo-1600857544200-b2f666a9a2ec?w=800&auto=format&fit=crop&q=80', // natural soap bars
  shampoo_bottle: 'https://images.unsplash.com/photo-1535585209827-a15fcdbc4c2d?w=800&auto=format&fit=crop&q=80', // shampoo & conditioner bottles
  shower_gel_wash: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=800&auto=format&fit=crop&q=80', // body wash
  face_serum_dropper: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=800&auto=format&fit=crop&q=80', // serum dropper
  face_moisturizer_cream: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=800&auto=format&fit=crop&q=80', // facial cream jar
  lipstick_matte: 'https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=800&auto=format&fit=crop&q=80', // lipstick
  liquid_foundation: 'https://images.unsplash.com/photo-1631729371254-42c2892f0e6e?w=800&auto=format&fit=crop&q=80', // foundation bottle
  mascara_eye: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=800&auto=format&fit=crop&q=80', // makeup / mascara
  eyeshadow_palette: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=800&auto=format&fit=crop&q=80', // eyeshadow
};

async function test() {
  console.log('Testing candidate URLs...');
  for (const [key, url] of Object.entries(testUrls)) {
    const res = await checkUrl(url);
    console.log(`${res.ok ? '✅' : '❌'} [${res.status}] ${key}: ${url.slice(0, 70)}`);
  }
}

test();
