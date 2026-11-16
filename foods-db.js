/* NutriMeta · Alimentos de referencia (Perú y comunes)
   Valores APROXIMADOS por 100 g, de tablas nutricionales generales (no verificados contra
   tablas peruanas oficiales). `en` es la descripción en inglés que usa el reconocimiento por
   foto (CLIP entiende mejor el inglés). `portion` = porción típica en gramos. */
(() => {
  'use strict';
  // [nombre, descripción para la foto, kcal, proteína g, carbohidratos g, grasa g, porción g]
  const rows = [
    // Platos peruanos y comida preparada
    ['Lomo saltado', 'lomo saltado, Peruvian stir-fried beef with onions, tomatoes and french fries, served with rice', 180, 9, 20, 7, 400],
    ['Arroz con pollo', 'arroz con pollo, green cilantro rice with chicken', 150, 8, 18, 5, 350],
    ['Ají de gallina', 'aji de gallina, creamy yellow chili chicken stew', 170, 9, 9, 11, 250],
    ['Ceviche', 'ceviche, raw fish marinated in lime juice with onion', 90, 15, 5, 1.5, 250],
    ['Papa a la huancaína', 'papa a la huancaina, boiled potatoes with yellow cheese sauce', 150, 4, 14, 8.5, 200],
    ['Causa limeña', 'causa limena, layered cold yellow potato terrine with chicken or tuna', 130, 5, 15, 6, 200],
    ['Tallarín saltado', 'tallarin saltado, Peruvian stir-fried noodles with beef', 170, 7, 22, 6, 350],
    ['Arroz chaufa', 'arroz chaufa, Peruvian fried rice', 175, 6, 25, 5.5, 350],
    ['Seco de res', 'seco de res, Peruvian beef stew with cilantro and beans', 150, 11, 8, 8, 300],
    ['Anticuchos', 'anticuchos, grilled beef heart skewers', 170, 20, 2, 9, 150],
    ['Pollo a la brasa', 'pollo a la brasa, Peruvian rotisserie roasted chicken', 215, 22, 0, 14, 220],
    ['Tacu tacu', 'tacu tacu, fried rice and beans patty', 190, 7, 28, 5, 300],
    ['Salchipapa', 'salchipapa, french fries with sliced sausage', 280, 9, 26, 16, 300],
    ['Chicharrón de pollo', 'fried chicken pieces, chicharron de pollo', 260, 20, 12, 15, 200],
    ['Pescado frito', 'fried fish fillet', 200, 20, 6, 11, 200],
    ['Caldo de gallina', 'chicken noodle soup, caldo de gallina', 45, 4, 4, 1.5, 400],
    ['Arroz con leche', 'arroz con leche, rice pudding', 140, 3, 25, 3, 200],
    ['Mazamorra morada', 'mazamorra morada, purple corn pudding', 85, 0.5, 20, 0.2, 250],
    ['Picarones', 'picarones, fried sweet potato and squash donuts with syrup', 330, 4, 45, 15, 120],
    ['Empanada', 'empanada, baked meat pastry', 300, 9, 30, 16, 100],
    ['Tamal', 'tamal peruano, corn tamale wrapped in a banana leaf', 190, 6, 25, 7, 200],
    ['Sándwich de pollo', 'chicken sandwich on a bread roll', 220, 12, 27, 7, 150],
    ['Hamburguesa', 'hamburger with bun', 250, 13, 24, 11, 200],
    ['Pizza', 'slice of pizza', 266, 11, 33, 10, 120],
    ['Hot dog', 'hot dog with bun', 250, 10, 20, 14, 120],

    // Acompañamientos y básicos
    ['Arroz blanco', 'cooked white rice', 130, 2.7, 28, 0.3, 200],
    ['Papa cocida', 'boiled potatoes', 87, 1.9, 20, 0.1, 200],
    ['Papas fritas', 'french fries', 312, 3.4, 41, 15, 150],
    ['Camote cocido', 'boiled sweet potato', 90, 2, 21, 0.1, 150],
    ['Choclo cocido', 'boiled Peruvian corn on the cob, choclo', 96, 3.4, 21, 1.5, 150],
    ['Yuca cocida', 'boiled cassava, yuca', 160, 1.4, 38, 0.3, 150],
    ['Quinua cocida', 'cooked quinoa', 120, 4.4, 21, 1.9, 180],
    ['Frejoles cocidos', 'cooked beans, frejoles', 127, 8.7, 23, 0.5, 200],
    ['Lentejas cocidas', 'cooked lentils', 116, 9, 20, 0.4, 200],
    ['Fideos cocidos', 'cooked spaghetti pasta', 158, 5.8, 31, 0.9, 200],
    ['Pan francés', 'bread roll', 270, 9, 52, 3, 60],
    ['Huevo frito', 'fried egg', 196, 13.6, 0.8, 15, 55],
    ['Huevo cocido', 'boiled eggs', 155, 13, 1.1, 11, 50],
    ['Huevo revuelto', 'scrambled eggs', 170, 11, 1.6, 13, 100],
    ['Pechuga de pollo a la plancha', 'grilled chicken breast', 165, 31, 0, 3.6, 150],
    ['Bistec de res', 'grilled beef steak', 250, 26, 0, 16, 150],
    ['Pescado a la plancha', 'grilled fish fillet', 140, 22, 0, 5, 150],
    ['Chuleta de cerdo', 'pork chop', 230, 25, 0, 14, 150],
    ['Ensalada fresca', 'green salad with lettuce and tomato', 25, 1, 4, 0.3, 150],
    ['Palta', 'avocado, palta', 160, 2, 9, 15, 100],
    ['Verduras cocidas', 'cooked mixed vegetables', 40, 2, 7, 1, 150],
    ['Avena preparada', 'oatmeal porridge, avena', 85, 3.5, 13, 2, 300],
    ['Yogur', 'yogurt in a cup', 61, 3.5, 4.7, 3.3, 200],
    ['Queso fresco', 'fresh white cheese, queso fresco', 260, 17, 3, 19, 50],

    // Frutas
    ['Plátano', 'banana', 89, 1.1, 23, 0.3, 120],
    ['Manzana', 'apple', 52, 0.3, 14, 0.2, 180],
    ['Naranja', 'orange', 47, 0.9, 12, 0.1, 150],
    ['Mandarina', 'mandarin orange', 53, 0.8, 13, 0.3, 80],
    ['Uvas', 'grapes', 69, 0.7, 18, 0.2, 100],
    ['Piña', 'pineapple slices', 50, 0.5, 13, 0.1, 150],
    ['Papaya', 'papaya', 43, 0.5, 11, 0.3, 150],
    ['Sandía', 'watermelon', 30, 0.6, 8, 0.2, 200],
    ['Fresas', 'strawberries', 32, 0.7, 7.7, 0.3, 100],
    ['Mango', 'mango', 60, 0.8, 15, 0.4, 150],
    ['Chirimoya', 'cherimoya, custard apple', 75, 1.6, 18, 0.7, 150],

    // Snacks y postres
    ['Galletas', 'cookies and biscuits', 450, 6, 70, 16, 30],
    ['Chocolate', 'chocolate bar', 546, 4.9, 61, 31, 30],
    ['Helado', 'ice cream', 207, 3.5, 24, 11, 100],
    ['Torta o keke', 'slice of cake', 370, 5, 50, 17, 80],
    ['Frutos secos', 'mixed nuts', 600, 20, 21, 53, 30],
  ];

  window.NutriMeta.referenceFoods = rows.map(([name, en, kcal, protein, carbs, fat, portion], i) => ({
    id: `ref:${i}`, name, en, kcal, protein, carbs, fat, portion,
  }));
})();
