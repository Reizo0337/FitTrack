import { describe, expect, it } from 'vitest';
import { detectIntent } from './intent';

describe('detectIntent: registrar lo comido', () => {
  it.each([
    'He comido 200 g de pechuga de pollo, 150 g de arroz cocido y una cucharada de aceite',
    'Para cenar he tomado una tortilla de dos huevos y ensalada',
    'Acabo de desayunar dos tostadas con tomate y un café con leche',
    'me he tomado un batido de Prozis',
    'Hoy cené pizza',
  ])('"%s" → log', (text) => {
    expect(detectIntent(text)).toEqual({ tool: 'log', text });
  });
  it('no registra si es una pregunta o no hay señales de comida', () => {
    expect(detectIntent('¿He comido suficiente proteína hoy?')).toBeNull();
    expect(detectIntent('Hoy he comido mucho y me siento fatal')).toBeNull();
    expect(detectIntent('Quiero comer más sano')).toBeNull();
  });
});

describe('detectIntent: qué comer', () => {
  it.each(['¿Qué puedo cenar hoy?', 'qué ceno', 'Dame ideas de comida', 'Necesito algo rápido para comer', 'Recomiéndame una cena'])('"%s" → eat', (text) => {
    expect(detectIntent(text)?.tool).toBe('eat');
  });
  it('extrae categoría, presupuesto y alimentos disponibles', () => {
    expect(detectIntent('Dame ideas de cena barata de menos de 5 euros')).toEqual({ tool: 'eat', category: 'economica', budgetEur: 5 });
    expect(detectIntent('¿Qué puedo cenar? Tengo pollo, arroz y un poco de brócoli')).toEqual({ tool: 'eat', available: ['pollo', 'arroz', 'brócoli'.normalize('NFD').replace(/[̀-ͯ]/g, '')] });
    expect(detectIntent('Dame una receta alta en proteína')).toMatchObject({ tool: 'eat', category: 'receta' });
  });
  it('si habla de mañana o de la semana no lo toma como «qué comer hoy»', () => {
    expect(detectIntent('¿Qué debería comer mañana?')).toBeNull();
    expect(detectIntent('¿Qué como esta semana para perder peso?')).toBeNull();
  });
});

describe('detectIntent: menú semanal e informe', () => {
  it('menú semanal, con presupuesto opcional', () => {
    expect(detectIntent('Crea un menú semanal')).toEqual({ tool: 'menu' });
    expect(detectIntent('hazme un menú para la semana con 60 euros')).toEqual({ tool: 'menu', budgetEur: 60 });
  });
  it('un menú para un día suelto no es el menú semanal', () => {
    expect(detectIntent('Crea un menú para mañana')).toBeNull();
  });
  it.each(['Analiza mi semana', 'Dame el informe semanal', 'resumen de mi semana', '¿Cómo ha ido mi semana?'])('"%s" → report', (text) => {
    expect(detectIntent(text)).toEqual({ tool: 'report' });
  });
});

describe('detectIntent: conversación normal', () => {
  it.each([
    '¿Cuántas proteínas me faltan?',
    '¿Estoy perdiendo peso demasiado rápido?',
    '¿Por qué llevo dos semanas sin bajar de peso?',
    '¿Cuántas calorías he consumido esta semana?',
    '¿Cómo afecta dormir poco a mi actividad?',
    'hola',
    '',
  ])('"%s" → null', (text) => {
    expect(detectIntent(text)).toBeNull();
  });
});
