import 'dart:convert';
import 'package:flutter/foundation.dart'
    show TargetPlatform, defaultTargetPlatform, kIsWeb;
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

void main() {
  runApp(const QuizApp());
}

String apiDifficultyFromUi(String value) {
  switch (value) {
    case 'Dễ':
      return 'De';
    case 'Trung bình':
      return 'Trung binh';
    case 'Khó':
      return 'Kho';
    default:
      return value;
  }
}

String uiDifficultyFromApi(String value) {
  switch (value) {
    case 'De':
      return 'Dễ';
    case 'Trung binh':
      return 'Trung bình';
    case 'Kho':
      return 'Khó';
    default:
      return value;
  }
}

class AppConfig {
  static String get baseUrl {
    if (kIsWeb) return 'http://localhost:3000/api';
    if (defaultTargetPlatform == TargetPlatform.android) {
      return 'http://10.0.2.2:3000/api';
    }
    return 'http://localhost:3000/api';
  }
}

class ApiService {
  Future<Map<String, dynamic>> login(String username, String password) async {
    final response = await http.post(
      Uri.parse('${AppConfig.baseUrl}/auth/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'username': username, 'password': password}),
    );
    if (response.statusCode != 200) throw Exception('Đăng nhập thất bại');
    return jsonDecode(response.body);
  }

  Future<List<dynamic>> getGrades() async {
    final response = await http.get(Uri.parse('${AppConfig.baseUrl}/grades'));
    return jsonDecode(response.body);
  }

  Future<List<dynamic>> getSubjects(int grade) async {
    final response = await http.get(
      Uri.parse('${AppConfig.baseUrl}/subjects?grade=$grade'),
    );
    return jsonDecode(response.body);
  }

  Future<List<dynamic>> getQuizzes({
    int? grade,
    String? subject,
    String? search,
    String? difficulty,
  }) async {
    final params = <String, String>{};
    if (grade != null) params['grade'] = '$grade';
    if (subject != null && subject.isNotEmpty) params['subject'] = subject;
    if (search != null && search.isNotEmpty) params['search'] = search;
    if (difficulty != null && difficulty != 'Tất cả') {
      params['difficulty'] = difficulty;
    }
    final uri = Uri.parse(
      '${AppConfig.baseUrl}/quizzes',
    ).replace(queryParameters: params);
    final response = await http.get(uri);
    return jsonDecode(response.body);
  }

  Future<Map<String, dynamic>> getQuizDetail(int id) async {
    final response = await http.get(Uri.parse('${AppConfig.baseUrl}/quizzes/$id'));
    return jsonDecode(response.body);
  }

  Future<Map<String, dynamic>> submitAttempt({
    required int userId,
    required int quizId,
    required List<Map<String, dynamic>> answers,
  }) async {
    final response = await http.post(
      Uri.parse('${AppConfig.baseUrl}/attempts'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'userId': userId, 'quizId': quizId, 'answers': answers}),
    );
    return jsonDecode(response.body);
  }

  Future<List<dynamic>> getAttempts(int userId) async {
    final response = await http.get(
      Uri.parse('${AppConfig.baseUrl}/attempts?userId=$userId'),
    );
    return jsonDecode(response.body);
  }

  Future<Map<String, dynamic>> getStats(int userId) async {
    final response = await http.get(Uri.parse('${AppConfig.baseUrl}/stats/$userId'));
    return jsonDecode(response.body);
  }

  Future<List<dynamic>> getRecommendations(int userId) async {
    final response = await http.get(
      Uri.parse('${AppConfig.baseUrl}/recommendations/$userId'),
    );
    return jsonDecode(response.body);
  }

  Future<List<dynamic>> getFavorites(int userId) async {
    final response = await http.get(
      Uri.parse('${AppConfig.baseUrl}/favorites?userId=$userId'),
    );
    return jsonDecode(response.body);
  }

  Future<List<dynamic>> getRankings({int? grade}) async {
    final uri = Uri.parse('${AppConfig.baseUrl}/rankings').replace(
      queryParameters: grade == null ? null : {'grade': '$grade'},
    );
    final response = await http.get(uri);
    return jsonDecode(response.body);
  }

  Future<void> toggleFavorite(int userId, int quizId, bool shouldAdd) async {
    final uri = Uri.parse('${AppConfig.baseUrl}/favorites');
    if (shouldAdd) {
      await http.post(
        uri,
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'userId': userId, 'quizId': quizId}),
      );
      return;
    }
    await http.delete(
      uri,
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'userId': userId, 'quizId': quizId}),
    );
  }
}

class QuizApp extends StatelessWidget {
  const QuizApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Luyện Thi Trắc Nghiệm',
      theme: ThemeData(
        useMaterial3: true,
        colorSchemeSeed: const Color(0xFF5C6BC0),
      ),
      home: const LoginScreen(),
    );
  }
}

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _api = ApiService();
  final _username = TextEditingController(text: 'student1');
  final _password = TextEditingController(text: '123456');
  bool _loading = false;
  String? _error;

  Future<void> _doLogin() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await _api.login(_username.text.trim(), _password.text.trim());
      if (!mounted) return;
      Navigator.pushReplacement(
        context,
        PageRouteBuilder(
          pageBuilder: (_, __, ___) => HomeScreen(
            api: _api,
            user: data['user'] as Map<String, dynamic>,
          ),
          transitionsBuilder: (_, animation, __, child) =>
              FadeTransition(opacity: animation, child: child),
        ),
      );
    } catch (_) {
      setState(() => _error = 'Đăng nhập thất bại, vui lòng thử lại');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [Color(0xFF6A5AE0), Color(0xFF8E9CFF), Color(0xFF56CCF2)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Card(
              elevation: 12,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.school_rounded, size: 60, color: Color(0xFF5C6BC0)),
                    const SizedBox(height: 12),
                    const Text(
                      'QuizMaster 1-12 ✨',
                      style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: _username,
                      decoration: const InputDecoration(
                        labelText: 'Tài khoản',
                        prefixIcon: Icon(Icons.person),
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _password,
                      obscureText: true,
                      decoration: const InputDecoration(
                        labelText: 'Mật khẩu',
                        prefixIcon: Icon(Icons.lock),
                      ),
                    ),
                    const SizedBox(height: 16),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton.icon(
                        onPressed: _loading ? null : _doLogin,
                        icon: _loading
                            ? const SizedBox(
                                width: 14,
                                height: 14,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Icon(Icons.login),
                        label: const Text('Đăng nhập'),
                      ),
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: 10),
                      Text(_error!, style: const TextStyle(color: Colors.red)),
                    ]
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class HomeScreen extends StatefulWidget {
  final ApiService api;
  final Map<String, dynamic> user;
  const HomeScreen({super.key, required this.api, required this.user});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with TickerProviderStateMixin {
  late Future<Map<String, dynamic>> _stats;
  late Future<List<dynamic>> _recommendations;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  void _reload() {
    _stats = widget.api.getStats(widget.user['id']);
    _recommendations = widget.api.getRecommendations(widget.user['id']);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverAppBar.large(
            pinned: true,
            expandedHeight: 200,
            title: const Text('Bảng điều khiển'),
            flexibleSpace: FlexibleSpaceBar(
              background: Container(
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    colors: [Color(0xFF5C6BC0), Color(0xFF29B6F6)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                ),
                child: Padding(
                  padding: const EdgeInsets.only(left: 18, right: 18, top: 90),
                  child: Text(
                    'Xin chào ${widget.user['fullName']}',
                    style: const TextStyle(fontSize: 24, color: Colors.white, fontWeight: FontWeight.w700),
                  ),
                ),
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  colors: [Color(0xFFF8F5FF), Color(0xFFF0FBFF)],
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                ),
              ),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                children: [
                  FutureBuilder<Map<String, dynamic>>(
                    future: _stats,
                    builder: (_, snapshot) {
                      final stats = snapshot.data ?? {'totalAttempts': 0, 'avgScore': 0, 'bestScore': 0};
                      return _StatsRow(stats: stats);
                    },
                  ),
                  const SizedBox(height: 14),
                  _FeatureTile(
                    icon: Icons.auto_awesome,
                    title: 'Luyện thi nâng cao',
                    subtitle: 'Lọc theo lớp, môn, độ khó, tìm kiếm nhanh',
                    onTap: () async {
                      await Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => ExploreScreen(api: widget.api, user: widget.user),
                        ),
                      );
                      setState(_reload);
                    },
                  ),
                  _FeatureTile(
                    icon: Icons.history_toggle_off,
                    title: 'Lịch sử và thống kê',
                    subtitle: 'Xem chi tiết các bài thi đã nộp',
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => HistoryScreen(api: widget.api, user: widget.user),
                      ),
                    ),
                  ),
                  _FeatureTile(
                    icon: Icons.favorite,
                    title: 'Bộ sưu tập đề yêu thích',
                    subtitle: 'Lưu đề quan tâm để học lại nhanh',
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => FavoritesScreen(api: widget.api, user: widget.user),
                      ),
                    ),
                  ),
                  _FeatureTile(
                    icon: Icons.emoji_events_rounded,
                    title: 'Bảng xếp hạng',
                    subtitle: 'So sánh điểm trung bình theo lớp',
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => RankingScreen(api: widget.api, user: widget.user),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  const Align(
                    alignment: Alignment.centerLeft,
                    child: Text('Đề gợi ý cho bạn', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  ),
                  const SizedBox(height: 8),
                  FutureBuilder<List<dynamic>>(
                    future: _recommendations,
                    builder: (_, snapshot) {
                      if (!snapshot.hasData) return const LinearProgressIndicator();
                      final data = snapshot.data!;
                      if (data.isEmpty) return const Text('Chưa có đề gợi ý');
                      return Column(
                        children: data
                            .map((item) => _RecommendationCard(
                                  item: item,
                                  onTap: () async {
                                    await Navigator.push(
                                      context,
                                      MaterialPageRoute(
                                        builder: (_) => QuizScreen(
                                          api: widget.api,
                                          user: widget.user,
                                          quizId: item['id'],
                                        ),
                                      ),
                                    );
                                    setState(_reload);
                                  },
                                ))
                            .toList(),
                      );
                    },
                  ),
                ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class ExploreScreen extends StatefulWidget {
  final ApiService api;
  final Map<String, dynamic> user;
  const ExploreScreen({super.key, required this.api, required this.user});

  @override
  State<ExploreScreen> createState() => _ExploreScreenState();
}

class _ExploreScreenState extends State<ExploreScreen> {
  int? selectedGrade;
  String? selectedSubject;
  String difficulty = 'Tất cả';
  final _search = TextEditingController();
  List<dynamic> quizzes = [];
  List<dynamic> grades = [];
  List<dynamic> subjects = [];
  bool loading = true;

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    grades = await widget.api.getGrades();
    selectedGrade = widget.user['grade'] as int;
    await _loadSubjects();
    await _loadQuizzes();
  }

  Future<void> _loadSubjects() async {
    subjects = await widget.api.getSubjects(selectedGrade ?? 1);
    if (subjects.isNotEmpty) selectedSubject = subjects.first['name'];
  }

  Future<void> _loadQuizzes() async {
    setState(() => loading = true);
    quizzes = await widget.api.getQuizzes(
      grade: selectedGrade,
      subject: selectedSubject,
      search: _search.text.trim(),
      difficulty: apiDifficultyFromUi(difficulty),
    );
    setState(() => loading = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Khám phá đề thi')),
      body: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          children: [
            Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<int>(
                    initialValue: selectedGrade,
                    decoration: const InputDecoration(labelText: 'Lớp'),
                    items: grades
                        .map((g) => DropdownMenuItem<int>(value: g['id'], child: Text(g['name'])))
                        .toList(),
                    onChanged: (v) async {
                      if (v == null) return;
                      selectedGrade = v;
                      await _loadSubjects();
                      await _loadQuizzes();
                    },
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: DropdownButtonFormField<String>(
                    initialValue: selectedSubject,
                    decoration: const InputDecoration(labelText: 'Môn'),
                    items: subjects
                        .map((s) => DropdownMenuItem<String>(value: s['name'], child: Text(s['name'])))
                        .toList(),
                    onChanged: (v) async {
                      selectedSubject = v;
                      await _loadQuizzes();
                    },
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _search,
                    decoration: const InputDecoration(
                      prefixIcon: Icon(Icons.search),
                      hintText: 'Tìm theo tên đề',
                    ),
                    onSubmitted: (_) => _loadQuizzes(),
                  ),
                ),
                const SizedBox(width: 10),
                DropdownButton<String>(
                  value: difficulty,
                  items: const ['Tất cả', 'Dễ', 'Trung bình', 'Khó']
                      .map((d) => DropdownMenuItem<String>(value: d, child: Text(d)))
                      .toList(),
                  onChanged: (v) async {
                    if (v == null) return;
                    setState(() => difficulty = v);
                    await _loadQuizzes();
                  },
                )
              ],
            ),
            const SizedBox(height: 10),
            Expanded(
              child: loading
                  ? const Center(child: CircularProgressIndicator())
                  : quizzes.isEmpty
                      ? const Center(child: Text('Không tìm thấy đề phù hợp'))
                      : ListView.builder(
                          itemCount: quizzes.length,
                          itemBuilder: (_, i) {
                            final q = quizzes[i];
                            return TweenAnimationBuilder<double>(
                              tween: Tween(begin: 0, end: 1),
                              duration: Duration(milliseconds: 250 + (i * 40)),
                              builder: (_, value, child) => Opacity(
                                opacity: value,
                                child: Transform.translate(
                                  offset: Offset(0, (1 - value) * 12),
                                  child: child,
                                ),
                              ),
                              child: Card(
                                child: ListTile(
                                  title: Text(q['title']),
                                  subtitle: Text(
                                    '${q['subject']} • ${uiDifficultyFromApi(q['difficulty'])} • ${q['questionCount']} câu',
                                  ),
                                  trailing: const Icon(Icons.play_arrow),
                                  onTap: () => Navigator.push(
                                    context,
                                    MaterialPageRoute(
                                      builder: (_) => QuizScreen(
                                        api: widget.api,
                                        user: widget.user,
                                        quizId: q['id'],
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            );
                          },
                        ),
            )
          ],
        ),
      ),
    );
  }
}

class QuizScreen extends StatefulWidget {
  final ApiService api;
  final Map<String, dynamic> user;
  final int quizId;
  const QuizScreen({super.key, required this.api, required this.user, required this.quizId});

  @override
  State<QuizScreen> createState() => _QuizScreenState();
}

class _QuizScreenState extends State<QuizScreen> {
  Map<String, dynamic>? quiz;
  final Map<int, int> selectedAnswers = {};
  bool loading = true;
  bool favorite = false;

  @override
  void initState() {
    super.initState();
    _loadQuiz();
  }

  Future<void> _loadQuiz() async {
    final data = await widget.api.getQuizDetail(widget.quizId);
    final favorites = await widget.api.getFavorites(widget.user['id']);
    setState(() {
      quiz = data;
      loading = false;
      favorite = favorites.any((f) => f['id'] == widget.quizId);
    });
  }

  Future<void> _toggleFavorite() async {
    await widget.api.toggleFavorite(widget.user['id'], widget.quizId, !favorite);
    setState(() => favorite = !favorite);
  }

  Future<void> _submit() async {
    if (quiz == null) return;
    final answers = selectedAnswers.entries
        .map((e) => {'questionId': e.key, 'selectedAnswer': e.value})
        .toList();
    final result = await widget.api.submitAttempt(
      userId: widget.user['id'],
      quizId: widget.quizId,
      answers: answers,
    );
    if (!mounted) return;
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(builder: (_) => ResultScreen(result: result)),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (loading || quiz == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final questions = quiz!['questions'] as List<dynamic>;
    final progress = selectedAnswers.length / questions.length;
    return Scaffold(
      appBar: AppBar(
        title: Text(quiz!['title']),
        actions: [
          IconButton(
            onPressed: _toggleFavorite,
            icon: Icon(favorite ? Icons.favorite : Icons.favorite_border),
          )
        ],
      ),
      body: Column(
        children: [
          LinearProgressIndicator(value: progress),
          Padding(
            padding: const EdgeInsets.all(8),
            child: Text('Tiến độ: ${selectedAnswers.length}/${questions.length} câu'),
          ),
          Expanded(
            child: ListView.builder(
              itemCount: questions.length,
              itemBuilder: (_, i) {
                final q = questions[i];
                final options = (q['options'] as List<dynamic>).cast<String>();
                return Card(
                  margin: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Câu ${i + 1}: ${q['content']}'),
                        const SizedBox(height: 8),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: List.generate(options.length, (idx) {
                            final isSelected = selectedAnswers[q['id']] == idx;
                            return ChoiceChip(
                              label: Text(options[idx]),
                              selected: isSelected,
                              onSelected: (_) => setState(() => selectedAnswers[q['id']] = idx),
                            );
                          }),
                        )
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(10),
            child: SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: _submit,
                icon: const Icon(Icons.send),
                label: const Text('Nộp bài'),
              ),
            ),
          )
        ],
      ),
    );
  }
}

class ResultScreen extends StatelessWidget {
  final Map<String, dynamic> result;
  const ResultScreen({super.key, required this.result});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Card(
          elevation: 8,
          margin: const EdgeInsets.all(24),
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.emoji_events, color: Colors.orange, size: 62),
                const SizedBox(height: 10),
                Text('Điểm ${result['score']}',
                    style: const TextStyle(fontSize: 30, fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                Text('Đúng ${result['correct']}/${result['total']} câu'),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: () => Navigator.popUntil(context, (route) => route.isFirst),
                  child: const Text('Về trang chủ'),
                )
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class HistoryScreen extends StatefulWidget {
  final ApiService api;
  final Map<String, dynamic> user;
  const HistoryScreen({super.key, required this.api, required this.user});

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  late Future<List<dynamic>> attempts;

  @override
  void initState() {
    super.initState();
    attempts = widget.api.getAttempts(widget.user['id']);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Lịch sử bài làm')),
      body: FutureBuilder<List<dynamic>>(
        future: attempts,
        builder: (_, snapshot) {
          if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
          final list = snapshot.data!;
          if (list.isEmpty) return const Center(child: Text('Chưa có lịch sử'));
          return ListView.builder(
            itemCount: list.length,
            itemBuilder: (_, i) {
              final a = list[i];
              return ListTile(
                leading: CircleAvatar(child: Text('${a['score']}')),
                title: Text('Đề #${a['quizId']}'),
                subtitle: Text('Đúng ${a['correct']}/${a['total']}'),
                trailing: Text((a['submittedAt'] as String).substring(0, 10)),
              );
            },
          );
        },
      ),
    );
  }
}

class FavoritesScreen extends StatefulWidget {
  final ApiService api;
  final Map<String, dynamic> user;
  const FavoritesScreen({super.key, required this.api, required this.user});

  @override
  State<FavoritesScreen> createState() => _FavoritesScreenState();
}

class _FavoritesScreenState extends State<FavoritesScreen> {
  late Future<List<dynamic>> favorites;

  @override
  void initState() {
    super.initState();
    favorites = widget.api.getFavorites(widget.user['id']);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Đề yêu thích')),
      body: FutureBuilder<List<dynamic>>(
        future: favorites,
        builder: (_, snapshot) {
          if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
          final data = snapshot.data!;
          if (data.isEmpty) return const Center(child: Text('Bạn chưa lưu đề nào'));
          return ListView(
            children: data
                .map(
                  (item) => Card(
                    child: ListTile(
                      title: Text(item['title']),
                      subtitle: Text('${item['subject']} - Lớp ${item['grade']}'),
                    ),
                  ),
                )
                .toList(),
          );
        },
      ),
    );
  }
}

class RankingScreen extends StatefulWidget {
  final ApiService api;
  final Map<String, dynamic> user;
  const RankingScreen({super.key, required this.api, required this.user});

  @override
  State<RankingScreen> createState() => _RankingScreenState();
}

class _RankingScreenState extends State<RankingScreen> {
  late Future<List<dynamic>> _rankings;

  @override
  void initState() {
    super.initState();
    _rankings = widget.api.getRankings(grade: widget.user['grade'] as int);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Bảng xếp hạng lớp')),
      body: FutureBuilder<List<dynamic>>(
        future: _rankings,
        builder: (_, snapshot) {
          if (!snapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }
          final data = snapshot.data!;
          if (data.isEmpty) {
            return const Center(child: Text('Chưa có dữ liệu xếp hạng'));
          }
          return ListView.builder(
            padding: const EdgeInsets.all(12),
            itemCount: data.length,
            itemBuilder: (_, i) {
              final row = data[i];
              final top = i < 3;
              return Container(
                margin: const EdgeInsets.only(bottom: 10),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(16),
                  gradient: top
                      ? const LinearGradient(
                          colors: [Color(0xFFFFE082), Color(0xFFFFCC80)],
                        )
                      : const LinearGradient(
                          colors: [Color(0xFFE3F2FD), Color(0xFFEDE7F6)],
                        ),
                ),
                child: ListTile(
                  leading: CircleAvatar(
                    backgroundColor: top ? Colors.orange : Colors.indigo,
                    child: Text('${i + 1}', style: const TextStyle(color: Colors.white)),
                  ),
                  title: Text(row['fullName']),
                  subtitle: Text('Số lần thi: ${row['attempts']}'),
                  trailing: Text(
                    '${row['averageScore']}',
                    style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}

class _StatsRow extends StatelessWidget {
  final Map<String, dynamic> stats;
  const _StatsRow({required this.stats});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(child: _StatCard(title: 'Lần thi', value: '${stats['totalAttempts']}')),
        const SizedBox(width: 8),
        Expanded(child: _StatCard(title: 'ĐTB', value: '${stats['avgScore']}')),
        const SizedBox(width: 8),
        Expanded(child: _StatCard(title: 'Cao nhất', value: '${stats['bestScore']}')),
      ],
    );
  }
}

class _StatCard extends StatelessWidget {
  final String title;
  final String value;
  const _StatCard({required this.title, required this.value});

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        gradient: const LinearGradient(colors: [Color(0xFFE0E7FF), Color(0xFFD1F5FF)]),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Column(
          children: [
            Text(value, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            Text(title),
          ],
        ),
      ),
    );
  }
}

class _FeatureTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  const _FeatureTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        leading: Icon(icon),
        title: Text(title),
        subtitle: Text(subtitle),
        trailing: const Icon(Icons.chevron_right),
        onTap: onTap,
      ),
    );
  }
}

class _RecommendationCard extends StatelessWidget {
  final Map<String, dynamic> item;
  final VoidCallback onTap;
  const _RecommendationCard({required this.item, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 4,
      child: ListTile(
        title: Text(item['title']),
        subtitle: Text(
          '${item['subject']} • ${uiDifficultyFromApi(item['difficulty']?.toString() ?? '')}',
        ),
        trailing: FilledButton.tonal(onPressed: onTap, child: const Text('Làm ngay')),
      ),
    );
  }
}
